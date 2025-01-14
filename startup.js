const app = require('./index.js');
const sql = require("mssql");
const dotenv = require("dotenv");

dotenv.config();

const port = process.env.PORT || 3000;

const config = {
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


app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
});