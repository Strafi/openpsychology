import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { openai } from './ai';

// Function to download voice file
export async function downloadVoiceFile(bot: TelegramBot, fileId: string): Promise<string> {
  const file = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  
  // Create temp directory if it doesn't exist
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
  
  const filePath = path.join(tempDir, `${fileId}.ogg`);
  const writer = fs.createWriteStream(filePath);
  
  const response = await axios({
    method: 'GET',
    url: fileUrl,
    responseType: 'stream'
  });
  
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(filePath));
    writer.on('error', reject);
  });
}

// Function to transcribe voice message
export async function transcribeVoiceMessage(filePath: string): Promise<string> {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
    language: "ru" // Changed to Russian language
  });
  
  // Clean up the temporary file
  fs.unlinkSync(filePath);
  
  return transcription.text;
} 