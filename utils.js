const jwt = require('jsonwebtoken');
const dotenv = require("dotenv");

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

const withJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')?.[1];

  if (!token) {
    res.status(401).send('No token provided');
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).send('Invalid token');
  }
}

module.exports = { withJWT };