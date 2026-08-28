require('dotenv').config();
const { Pool } = require('pg');

const isLocalhost = (process.env.DB_HOST || 'localhost') === 'localhost';
const useSSL = process.env.DB_SSL === 'true' || process.env.DATABASE_URL || !isLocalhost;

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: useSSL ? { rejectUnauthorized: false } : false,
    })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'postgres',
        password: process.env.DB_PASSWORD || 'mysecretpassword',
        port: process.env.DB_PORT || 5432,
        ssl: useSSL ? { rejectUnauthorized: false } : false,
    });

module.exports = pool;