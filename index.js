const express = require("express");
const sql = require("mssql");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
let appInsights = require("applicationinsights");

const app = express();

app.use(express.json());
app.use(cors());

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

const config = {
  user: process.env.SERVER_ADMIN_LOGIN,
  password: process.env.SERVER_ADMIN_PASSWORD,
  server: process.env.SERVER_URL,
  database: process.env.DATABASE_NAME,
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000,
  },
};

appInsights
  .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
  .setAutoCollectConsole(true, true)
  .setAutoCollectExceptions(true)
  .start();

const withJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")?.[1];

  if (!token) {
    res.status(401).send("No token provided");
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).send("Invalid token");
  }
};

const client = appInsights.defaultClient;

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    client.trackRequest({
      name: req.method + " " + req.url,
      url: req.url,
      duration: duration,
      resultCode: res.statusCode,
      success: res.statusCode < 400,
      properties: {
        method: req.method,
        userId: req.user ? req.user.id : "anonymous",
      },
    });
  });
  next();
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  let connection = undefined;
  try {
    connection = await sql.connect(config);

    const result = await sql.query`SELECT * FROM Users WHERE Email = ${email}`;
    if (!result.recordset[0]) {
      res.status(401).send("Invalid email or password");
      return;
    }
    const user = result.recordset[0];
    const passwordHash = user.PasswordHash;

    const isPasswordValid = await bcrypt.compare(password, passwordHash);
    if (!isPasswordValid) {
      res.status(401).send("Invalid email or password");
      return;
    }

    const token = jwt.sign({ email: user.Email, id: user.UserID }, JWT_SECRET, {
      expiresIn: "30d",
    });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  } finally {
    await connection?.close();
  }
});

app.get("/test-jwt", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json(decoded);
  } catch (err) {
    res.status(401).send("Invalid token");
  }
});

app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).send("Missing required fields");
    return;
  }

  let connection = undefined;
  try {
    connection = await sql.connect(config);
    const result =
      await sql.query`SELECT * FROM Users WHERE Email = '${email}'`;

    if (result.recordset[0]) {
      res.status(400).send("Username already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await sql.query`INSERT INTO Users (Username, Email, PasswordHash) VALUES (${email}, ${email}, ${hashedPassword})`;
    res.send("User registered successfully");
    return;
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
    return;
  } finally {
    await connection?.close();
  }
});

app.get("/reset-db", withJWT, async (req, res) => {
  let connection = undefined;
  try {
    connection = await sql.connect(config);
    await sql.query`DELETE FROM Users`;
    res.send("Database reset successfully");
  } catch (err) {
    console.error(err);
  } finally {
    await connection?.close();
  }
});

app.post("/book", withJWT, async (req, res) => {
  const { user } = req;
  const { title, author, publishedYear } = req.body;

  if (!title || !author || !publishedYear) {
    res.status(400).send("Missing data");
    return;
  }

  let connection = undefined;
  try {
    connection = await sql.connect(config);

    const isDuplication =
      await sql.query`SELECT BookID FROM Books WHERE Title = ${title} AND Author = ${author} AND PublicationYear = ${publishedYear}`;

    if (isDuplication.recordset.length > 0) {
      res.status(400).send("Duplicated");
      return;
    }

    await sql.query`INSERT INTO Books (Title, Author, PublicationYear, AddedBy) VALUES (${title}, ${author}, ${publishedYear}, ${user.id})`;
    res.send("Added");
  } catch (err) {
    console.error(err);
  } finally {
    await connection?.close();
  }
});

app.get("/books", withJWT, async (req, res) => {
  let connection = undefined;
  try {
    connection = await sql.connect(config);
    const books = await sql.query`SELECT * FROM Books`;
    const ratings = await sql.query`SELECT * FROM Ratings`;

    const booksWithRatings = books.recordset.map((book) => {
      const myRating = ratings.recordset.find(
        (rating) =>
          rating.ItemID === book.BookID && rating.UserID === req.user.id
      );

      const ratingsOfBook = ratings.recordset.filter(
        (rating) => rating.ItemID === book.BookID
      );

      const avgRatingOfBook =
        ratingsOfBook.reduce((acc, curr) => acc + curr.Score, 0.0) /
        ratingsOfBook.length;

      return { ...book, myRating: myRating?.Score, avgRating: avgRatingOfBook };
    });

    res.send(booksWithRatings);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  } finally {
    await connection?.close();
  }
});

app.post("/rating", withJWT, async (req, res) => {
  const { bookId, score } = req.body;

  if (!bookId || !score || isNaN(score)) {
    res.status(400).send("Missing data");
    return;
  }

  let connection = undefined;
  try {
    connection = await sql.connect(config);

    if (score === -1) {
      await sql.query`DELETE FROM Ratings WHERE ItemID = ${bookId} AND UserID = ${req.user.id}`;
      res.send(true);
      return;
    }

    const isDuplication =
      await sql.query`SELECT * FROM Ratings WHERE ItemID = ${bookId} AND UserID = ${req.user.id}`;

    if (isDuplication.recordset.length > 0) {
      await sql.query`UPDATE Ratings SET Score = ${parseInt(
        score
      )} WHERE ItemID = ${bookId} AND UserID = ${req.user.id}`;
      res.send(true);
      return;
    }

    await sql.query`INSERT INTO Ratings (UserID, ItemID, ItemType, Score, Comment) VALUES (${req.user.id}, ${bookId}, 'Book', ${score}, '')`;
    res.send(true);
  } catch (err) {
    console.error(err);
  } finally {
    await connection?.close();
  }
});

app.get("/my-books", withJWT, async (req, res) => {
  let connection = undefined;
  try {
    connection = await sql.connect(config);
    const books =
      await sql.query`SELECT * FROM Books WHERE AddedBy = ${req.user.id}`;

    const ratingsOfMyBooks =
      await sql.query`SELECT * FROM Ratings WHERE ItemID IN (SELECT BookID FROM Books WHERE AddedBy = ${req.user.id})`;

    const booksWithRatings = books.recordset.map((book) => {
      const myRating = ratingsOfMyBooks.recordset.find(
        (rating) =>
          rating.ItemID === book.BookID && rating.UserID === req.user.id
      );

      const ratingsOfBook = ratingsOfMyBooks.recordset.filter(
        (rating) => rating.ItemID === book.BookID
      );

      const avgRatingOfBook =
        ratingsOfBook.reduce((acc, curr) => acc + curr.Score, 0.0) /
        ratingsOfBook.length;

      return { ...book, myRating: myRating?.Score, avgRating: avgRatingOfBook };
    });

    res.send(booksWithRatings);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  } finally {
    await connection?.close();
  }
});

app.delete("/books/:bookId", withJWT, async (req, res) => {
  const { bookId } = req.params;

  let connection = undefined;
  try {
    connection = await sql.connect(config);

    const transaction = new sql.Transaction(connection);
    await transaction.begin();

    try {
      await transaction
        .request()
        .input("bookId", sql.Int, bookId)
        .input("userId", sql.Int, req.user.id)
        .query(
          "DELETE FROM Books WHERE BookID = @bookId AND AddedBy = @userId"
        );

      await transaction
        .request()
        .input("bookId", sql.Int, bookId)
        .query("DELETE FROM Ratings WHERE ItemID = @bookId");

      await transaction.commit();
      res.send(true);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting book");
  } finally {
    await connection?.close();
  }
});
module.exports = app;
