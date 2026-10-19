import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
  ApiSecurity,
} from '@nestjs/swagger';
import { AWSService } from './aws.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

// Utilidad genérica para subir a S3 desde fuera (scripts, Postman, etc.),
// protegida con API key. El patrón real para "un usuario sube su archivo"
// (auth de sesión, guardar la key en el modelo dueño, firmar al leer) va en
// el módulo de cada entidad — ver `users.controller.ts` (foto de perfil)
// como ejemplo, documentado en docs/API.md.
@ApiTags('AWS S3')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('AWS')
export class AWSController {
  constructor(private readonly AWSService: AWSService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Subir archivo a AWS S3',
    description: `Sube un archivo al bucket de AWS S3.
Retorna la key del objeto y una URL firmada con validez de 1 hora. La key es
lo que se debe guardar (nunca la URL firmada, que expira).`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo a subir',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: '{ key, signedUrl, size }',
  })
  @ApiResponse({ status: 400, description: 'No se proporcionó ningún archivo' })
  @ApiResponse({ status: 401, description: 'API Key inválida' })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se proporcionó ningún archivo.');

    const key = await this.AWSService.uploadFile(file);
    const signedUrl = await this.AWSService.getSignedUrl(key);

    return { key, signedUrl, size: file.size };
  }

  @Get('signed-url')
  @ApiOperation({
    summary: 'Obtener URL firmada de un archivo',
    description: `Genera una URL pre-firmada con validez de 1 hora para acceder al archivo en S3.
El parámetro key debe ser el filePath devuelto por el endpoint de upload (ej. uploads/1234567890-foto.jpg).`,
  })
  @ApiQuery({
    name: 'key',
    description: 'Ruta/key del archivo en S3 (ej. uploads/1234567890-foto.jpg)',
    example: 'uploads/1234567890-foto.jpg',
  })
  @ApiResponse({ status: 200, description: '{ url: "https://..." } — expira en 1 hora' })
  @ApiResponse({ status: 400, description: 'El parámetro key es requerido' })
  @ApiResponse({ status: 401, description: 'API Key inválida' })
  async getSignedUrl(@Query('key') key: string) {
    if (!key) throw new BadRequestException('El parámetro key es requerido.');
    const url = await this.AWSService.getSignedUrl(key);
    return { url };
  }

  @Delete('*filePath')
  @ApiOperation({
    summary: 'Eliminar archivo de AWS S3',
    description: 'Elimina permanentemente un archivo del bucket. Esta acción no se puede deshacer.',
  })
  @ApiParam({
    name: 'filePath',
    description: 'Ruta del archivo en S3 (ej. uploads/1234567890-foto.jpg)',
    example: 'uploads/1234567890-foto.jpg',
  })
  @ApiResponse({ status: 200, description: '{ message: "Archivo eliminado correctamente" }' })
  @ApiResponse({ status: 401, description: 'API Key inválida' })
  async deleteFile(@Param('filePath') filePath: string) {
    await this.AWSService.deleteFile(filePath);
    return { message: 'Archivo eliminado correctamente.' };
  }
}
