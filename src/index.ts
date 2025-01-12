import express from "express";
import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

const config: sql.config = {
  user: process.env.SERVER_ADMIN_LOGIN,
  password: process.env.SERVER_ADMIN_PASSWORD,
  server: "agonista-receptorow-dopaminergicznych.database.windows.net",
  database: "anhedonia",
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000,
  },
};

app.get("/", (_req, res) => {
  console.log("Hello world!");
  console.log(process.env.SERVER_ADMIN_PASSWORD);

  res.send("Hello world!");
});

app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  let connection: sql.ConnectionPool | undefined;
  try {
    connection = await sql.connect(config);
    const result = await sql.query`SELECT TOP 10 * FROM Ratings`;
    console.log(result);
    await connection.close();
  } catch (err) {
    console.error(err);
  } finally {
    await connection?.close();
  }
});
