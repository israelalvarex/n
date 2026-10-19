import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { toNodeHandler } from 'better-auth/node';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { auth } from './auth/auth';
import { authPaths, authSchemas } from './auth/auth.swagger';

async function bootstrap() {
  // bodyParser: false a proposito. Better Auth necesita el cuerpo sin procesar,
  // asi que su handler se monta primero y el parser de Express despues.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true, // las sesiones viajan en cookie
  });

  app.use('/api/auth/{*path}', toNodeHandler(auth));
  // El guardado por lote de la hoja puede traer cientos de cuentas: 100 KB (el default) no alcanza.
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true }));

  // Documentacion interactiva para quien consuma la API. Los DTOs se leen
  // automaticamente gracias al plugin @nestjs/swagger en nest-cli.json; sin
  // el plugin, cada propiedad de cada DTO necesitaria @ApiProperty a mano.
  const openApi = new DocumentBuilder()
    .setTitle('Presupuesto Anual')
    .setDescription('API del flujo de presupuesto por departamento x casino')
    .setVersion('1.0')
    // El tercer argumento fija el nombre del esquema de seguridad; auth.swagger.ts
    // lo referencia como 'cookieAuth' en cada ruta que exige sesion.
    .addCookieAuth('better-auth.session_token', { type: 'apiKey', in: 'cookie' }, 'cookieAuth')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKeyAuth')
    .build();
  const document = SwaggerModule.createDocument(app, openApi);

  // ApiKeyGuard es global (ver AppModule): todo lo que pasa por el router de
  // Nest la exige. Solo se aplica como default a las rutas que no fijaron su
  // propio `security` (las de Better Auth en authPaths ya traen el suyo, asi
  // que esto no las toca).
  document.security = [{ apiKeyAuth: [], cookieAuth: [] }];

  // Better Auth se monta como middleware crudo de Express (linea de arriba),
  // no como controlador de Nest, asi que SwaggerModule nunca lo ve por su
  // cuenta. authPaths/authSchemas documentan esas rutas a mano para que
  // aparezcan en /docs junto con las 61 rutas que si genera Nest.
  Object.assign(document.paths, authPaths);
  Object.assign(document.components!.schemas!, authSchemas);

  SwaggerModule.setup('docs', app, document);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campos no declarados en el DTO
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
