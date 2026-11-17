import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    '[DB WARNING] DATABASE_URL no está definida en las variables de entorno. Las operaciones de base de datos directa requerirán esta variable.'
  );
}

// Configuración con SSL requerido y timeout de conexión seguro.
// Si no hay DATABASE_URL configurada, exporta una función que arroja un error claro
// en lugar de intentar conectarse a localhost:5432 y fallar con ECONNREFUSED.
export const sql: any = connectionString
  ? postgres(connectionString, {
      ssl: 'require',
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  : (() => {
      const missingDbHandler: any = async () => {
        throw new Error('DATABASE_URL no está configurada en las variables de entorno de Axioma Console en Vercel.');
      };
      return missingDbHandler;
    })();
