import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { Frequency, Month } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export const MONTHS: Month[] = [
  Month.jan, Month.feb, Month.mar, Month.apr, Month.may, Month.jun,
  Month.jul, Month.aug, Month.sep, Month.oct, Month.nov, Month.dec,
];

/** Meses en los que cae cada frecuencia periodica (1 = enero). */
const PERIODIC: Partial<Record<Frequency, number[]>> = {
  yearly: [1],
  biannual: [1, 7],
  quarterly: [1, 4, 7, 10],
  bimonthly: [1, 3, 5, 7, 9, 11],
  variable: [1, 4, 7, 10], // la guia del Excel la trata como trimestral
};

export interface CalculationInput {
  frequency: Frequency;
  quantity: Decimal | null;
  unitValue: Decimal | null;
  applicableMonths: number[];
  calendar: Array<{ month: Month; monthNumber: number; days: number }>;
}

@Injectable()
export class CalculationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Reparte cantidad x precio en los 12 meses segun la frecuencia.
   *
   *   daily        tarifa por dia x dias del mes
   *   perHeadcount plazas x tarifa diaria integrada x dias del mes
   *   monthly      el monto tal cual, cada mes
   *   yearly       todo en un solo mes
   *   perEvent     repartido en los meses del evento
   *   seasonal     solo en los meses aplicables
   *
   * Devuelve un mapa mes -> monto. Los meses que no aplican quedan en cero, no
   * ausentes: la hoja siempre tiene 12 celdas.
   */
  spread(input: CalculationInput): Map<Month, Decimal> {
    const { frequency, quantity, unitValue, applicableMonths, calendar } = input;
    const result = new Map<Month, Decimal>(MONTHS.map((m) => [m, new Decimal(0)]));

    if (!quantity || !unitValue) return result;
    const unit = new Decimal(quantity).mul(unitValue);

    for (const { month, monthNumber, days } of calendar) {
      let amount = new Decimal(0);

      switch (frequency) {
        case Frequency.daily:
        case Frequency.perHeadcount:
          amount = unit.mul(days);
          break;

        case Frequency.monthly:
          amount = unit;
          break;

        case Frequency.perEvent:
        case Frequency.seasonal: {
          // Sin meses declarados, un evento no cae en ninguno: mejor cero visible
          // que repartirlo donde nadie lo decidio.
          if (applicableMonths.includes(monthNumber)) amount = unit;
          break;
        }

        default: {
          const months = PERIODIC[frequency];
          if (months?.includes(monthNumber)) amount = unit;
          break;
        }
      }

      result.set(month, amount);
    }

    return result;
  }

  /**
   * Recalcula los 12 meses de un renglon y los guarda.
   *
   * Un override NO se pisa: se conserva su monto y solo se actualiza
   * calculatedAmount, para que la UI pueda mostrar la diferencia.
   */
  async recalculateLine(lineId: number): Promise<Decimal> {
    const line = await this.prisma.budgetLine.findUniqueOrThrow({
      where: { id: lineId },
      include: {
        lineItem: { select: { frequency: true, applicableMonths: true } },
        budget: { select: { fiscalYearId: true, businessUnitId: true } },
        resource: { select: { id: true } },
      },
    });

    const calendar = await this.prisma.monthCalendar.findMany({
      where: { fiscalYearId: line.budget.fiscalYearId },
      select: { month: true, monthNumber: true, days: true },
    });

    const unitValue = await this.resolveUnitValue(line.resourceId, line.budget.fiscalYearId, line.component);
    const quantity = await this.resolveQuantity(line);

    const months = this.spread({
      frequency: line.frequency ?? line.lineItem.frequency,
      quantity,
      unitValue,
      applicableMonths: line.lineItem.applicableMonths ?? [],
      calendar,
    });

    const existing = await this.prisma.budgetLineMonth.findMany({ where: { lineId } });
    const overrideByMonth = new Map(existing.filter((m) => m.isOverride).map((m) => [m.month, m.amount]));

    let total = new Decimal(0);
    const now = new Date();

    for (const [month, calculated] of months) {
      const override = overrideByMonth.get(month);
      const effective = override ?? calculated;
      total = total.add(effective);

      await this.prisma.budgetLineMonth.upsert({
        where: { lineId_month: { lineId, month } },
        update: { amount: effective, calculatedAmount: calculated, calculatedAt: now },
        create: { lineId, month, amount: effective, calculatedAmount: calculated, calculatedAt: now },
      });
    }

    await this.prisma.budgetLine.update({ where: { id: lineId }, data: { totalAnnual: total } });
    return total;
  }

  /** Precio del recurso para el ejercicio. El componente selecciona una columna del tabulador. */
  private async resolveUnitValue(resourceId: number | null, fiscalYearId: number, component: string | null) {
    if (!resourceId) return null;
    const fiscalYear = await this.prisma.fiscalYear.findUniqueOrThrow({
      where: { id: fiscalYearId },
      select: { year: true },
    });
    const value = await this.prisma.resourceValue.findFirst({
      where: { resourceId, year: fiscalYear.year, ...(component ? { component } : {}) },
      select: { value: true },
    });
    return value?.value ?? null;
  }

  /**
   * La cantidad del renglon manda. Si no la trae, se toma el consumo que ese
   * casino tiene declarado para el recurso: es lo que hace que el mismo recurso
   * cueste distinto en cada plaza.
   */
  private async resolveQuantity(line: { quantity: Decimal | null; resourceId: number | null; budget: { fiscalYearId: number; businessUnitId: number } }) {
    if (line.quantity) return line.quantity;
    if (!line.resourceId) return null;

    const declared = await this.prisma.resourceQuantity.findUnique({
      where: {
        resourceId_businessUnitId_fiscalYearId: {
          resourceId: line.resourceId,
          businessUnitId: line.budget.businessUnitId,
          fiscalYearId: line.budget.fiscalYearId,
        },
      },
      select: { quantity: true },
    });
    return declared?.quantity ?? null;
  }

  /** Texto que la UI muestra bajo el renglon: "104 plazas x $34.71 x dias del mes". */
  buildCalculationNote(quantity: Decimal | null, unit: string | null, value: Decimal | null, frequency: Frequency): string {
    if (!quantity || !value) return 'Sin recurso o sin cantidad: no calcula';
    const qty = `${quantity.toString()}${unit ? ` ${unit}` : ''}`;
    const price = `$${value.toString()}`;
    switch (frequency) {
      case Frequency.daily:
      case Frequency.perHeadcount:
        return `${qty} × ${price} × días del mes`;
      case Frequency.monthly:
        return `${qty} × ${price} al mes`;
      case Frequency.yearly:
        return `${qty} × ${price}, una vez al año`;
      default:
        return `${qty} × ${price}`;
    }
  }
}
