-- La opcion elegida para cada mes del renglon: banda del modelo, cierre de un
-- año o captura manual. Aditiva y nullable: no toca lo existente.
ALTER TABLE "budget_line_month" ADD COLUMN "variant" VARCHAR(20);
