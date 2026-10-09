import dotenv from 'dotenv';
import { app } from './app.js';
import { config } from './config.js';

dotenv.config();

app.listen(config.port, () => {
  console.log(`YCEP server running on http://localhost:${config.port}`);
});
