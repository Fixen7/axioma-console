import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    '[DB WARNING] DATABASE_URL no está definida en las variables de entorno. Las operaciones de base de datos directa fallarán.'
  );
}

// Configuración con SSL requerido y timeout de conexión seguro
export const sql = postgres(connectionString || 'postgresql://dummy:dummy@localhost:5432/dummy', {
  ssl: connectionString ? 'require' : false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
