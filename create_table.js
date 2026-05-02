const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://suspixels:Gtr7dtv6wfXfSGRaAW4TdFg1gxctxJ1z@dpg-d7r3u7km0tmc73837dm0-a.singapore-postgres.render.com/suspixels',
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to Render PostgreSQL');

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS pixels (
          id SERIAL PRIMARY KEY,
          x INTEGER NOT NULL,
          y INTEGER NOT NULL,
          color VARCHAR(7) NOT NULL,
          inserted_by VARCHAR(50) NOT NULL DEFAULT 'Anonymous',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(createTableQuery);
    console.log('Table "pixels" created successfully.');

    const createIndexQuery = `
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pixels_x_y" ON pixels(x, y);
    `;
    await client.query(createIndexQuery);
    console.log('Unique index on x,y created successfully.');

  } catch (error) {
    console.error('Error creating table:', error);
  } finally {
    await client.end();
  }
}

run();
