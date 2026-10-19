export const envConfig = {
  aws_bucket_name: process.env.AWS_BUCKET_NAME || '',
  aws_region: process.env.AWS_REGION || '',
  aws_access_key_id: process.env.AWS_ACCESS_KEY_ID || '',
  aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY || '',

  database_url: process.env.DATABASE_URL || '',

  // Llave que exige ApiKeyGuard en el header x-api-key. Sin ella no pasa nadie.
  api_key: process.env.API_KEY || '',

  contadigital_base_url:
    process.env.CONTADIGITAL_BASE_URL ||
    'https://contadigital-production.up.railway.app',
  contadigital_api_key: process.env.CONTADIGITAL_API_KEY || '',

  foliatti_base_url:
    process.env.FOLIATTI_BASE_URL ||
    'https://foliattilandbasedbback-production-044d.up.railway.app',
  foliatti_api_key: process.env.FOLIATTI_API_KEY || '',

  // Timeout por llamada a un endpoint fuente, en milisegundos.
  fuentes_timeout_ms: Number(process.env.FUENTES_TIMEOUT_MS || 60000),

  // Mapa empresa -> división de Foliatti, en formato "EMPRESA:DIVISION,EMPRESA:DIVISION".
  // Las empresas que no aparezcan aquí se reportan solo con la columna de ContaDigital.
  empresa_division_map: process.env.EMPRESA_DIVISION_MAP || 'BATTLER GG:BTL',

  // Base de datos de Foliatti a consultar; vacío usa la de por defecto (BI_Tootle).
  foliatti_database: process.env.FOLIATTI_DATABASE || '',
};
