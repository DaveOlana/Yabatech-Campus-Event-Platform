import dotenv from 'dotenv';
import { app } from './app';

dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.listen(PORT, () => {
  console.log(`YCEP server running on http://localhost:${PORT}`);
});
