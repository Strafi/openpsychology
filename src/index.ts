import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { openai, psychologistPrompt } from './ai';
import { downloadVoiceFile, transcribeVoiceMessage } from './voice';
import { ConversationHistory } from './conversationHistory';

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true });
const conversationHistory = new ConversationHistory();

// Set up bot commands
bot.setMyCommands([
  { command: 'help', description: 'Показать доступные возможности' },
  { command: 'end', description: 'Завершить сессию и получить резюме' }
]);

// Handle voice messages
bot.on('voice', async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  
  try {
    // Download the voice message
    const filePath = await downloadVoiceFile(bot, msg.voice!.file_id);
    
    // Transcribe the voice message
    const transcribedText = await transcribeVoiceMessage(filePath);
    
    // Initialize conversation history for new users
    if (conversationHistory.getHistory(chatId).length === 0) {
      await conversationHistory.addMessage(chatId, { role: "system", content: psychologistPrompt });
    }

    // Add transcribed message to history
    await conversationHistory.addMessage(chatId, { role: "user", content: transcribedText });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: conversationHistory.getHistory(chatId),
      temperature: 0.7,
      max_tokens: 800,
      top_p: 0.9,
      frequency_penalty: 0.5,
      presence_penalty: 0.5
    });

    const response = completion.choices[0].message?.content;
    if (response) {
      // Add assistant response to history
      await conversationHistory.addMessage(chatId, { role: "assistant", content: response });
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error processing voice message:', error);
    bot.sendMessage(chatId, 'Извините, но произошла ошибка при обработке вашего голосового сообщения. Пожалуйста, попробуйте еще раз или отправьте текстовое сообщение.');
  }
});

// Handle text messages
bot.on('message', async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  if (!userMessage) {
	return;
  }

  const isCommandMessage = userMessage.startsWith('/');

  if (isCommandMessage) {
    return;
  }

  try {
    // Initialize conversation history for new users
    if (conversationHistory.getHistory(chatId).length === 0) {
      await conversationHistory.addMessage(chatId, { role: "system", content: psychologistPrompt });
    }

    // Add user message to history
    await conversationHistory.addMessage(chatId, { role: "user", content: userMessage });

	console.log(conversationHistory.getHistory(chatId));
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: conversationHistory.getHistory(chatId),
      temperature: 0.7,
      max_tokens: 800,
      top_p: 0.9,
      frequency_penalty: 0.5,
      presence_penalty: 0.5
    });

    const response = completion.choices[0].message?.content;
    if (response) {
      // Add assistant response to history
      await conversationHistory.addMessage(chatId, { role: "assistant", content: response });
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error:', error);
    bot.sendMessage(chatId, 'Извините, произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Handle /start command
bot.onText(/\/start/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    '(Создано с любовью и ИИ) Привет! Я твой профессиональный психолог-ассистент. Я здесь, чтобы оказать тебе поддержку и эмпатическую помощь. Как я могу помочь тебе?'
  );
});

// Handle /help command
bot.onText(/\/help/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    'Я здесь, чтобы оказать психологическую поддержку и помощь. Ты можешь:\n' +
    '1. Поделиться своими мыслями и чувствами\n' +
    '2. Попросить стратегии преодоления трудностей\n' +
    '3. Получить рекомендации по личностному росту\n' +
    '4. Обсудить вопросы психического здоровья'
  );
});

// Handle /end command
bot.onText(/\/end/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  
  try {
    const summary = await conversationHistory.summarizeSession(chatId);
    if (summary) {
      bot.sendMessage(
        chatId,
        'Спасибо за сессию! Вот краткое резюме нашего разговора:\n\n' + summary,
		{ parse_mode: 'Markdown' }
      );
    } else {
      bot.sendMessage(
        chatId,
        'Спасибо за сессию! Если нужна еще одна сессия, просто отправь новое сообщение'
      );
    }
  } catch (error) {
    console.error('Error ending session:', error);
    bot.sendMessage(
      chatId,
      'Извините, произошла ошибка при завершении сессии. Пожалуйста, попробуйте еще раз.'
    );
  }
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await conversationHistory.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await conversationHistory.cleanup();
  process.exit(0);
});

console.log('Bot is running...'); 