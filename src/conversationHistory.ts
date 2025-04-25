import { openai } from './ai';
import { Storage } from './storage';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ConversationState = {
  messages: ChatMessage[];
  lastSummarizedIndex: number; // Index of the last message that was included in a summary
};

export class ConversationHistory {
  private history: { [key: number]: ConversationState } = {};
  private storage: Storage;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.storage = new Storage();
    this.loadHistory();
    
    // Set up periodic saving (every minute) as a backup
    this.saveTimer = setInterval(() => this.saveHistory(), 1 * 60 * 1000);
  }

  private async loadHistory(): Promise<void> {
    try {
      const data = await this.storage.loadConversations();
      // Convert old format to new format if needed
      this.history = Object.entries(data).reduce((acc, [chatId, messages]) => {
        const chatMessages = messages as ChatMessage[];
        // Find the last summary message index
        const lastSummaryIndex = chatMessages.reduce((lastIndex, msg, index) => {
          if (msg.role === 'assistant' && msg.content.startsWith('[Суммаризация сессии]:')) {
            return index;
          }
          return lastIndex;
        }, -1);

        acc[Number(chatId)] = {
          messages: chatMessages,
          lastSummarizedIndex: lastSummaryIndex
        };
        return acc;
      }, {} as { [key: number]: ConversationState });
      console.log('Conversation history loaded successfully');
	  console.log(this.history);
    } catch (error) {
      console.error('Error loading conversation history:', error);
      this.history = {};
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      // Convert to old format for backward compatibility
      const data = Object.entries(this.history).reduce((acc, [chatId, state]) => {
        acc[Number(chatId)] = state.messages;
        return acc;
      }, {} as { [key: number]: ChatMessage[] });
      
      await this.storage.saveConversations(data);
      console.log('Conversation history saved successfully');
    } catch (error) {
      console.error('Error saving conversation history:', error);
    }
  }

  async addMessage(chatId: number, message: ChatMessage): Promise<void> {
    if (!this.history[chatId]) {
      this.history[chatId] = {
        messages: [],
        lastSummarizedIndex: -1
      };
    }

    this.history[chatId].messages.push(message);
    // Save history immediately after adding a message
    await this.saveHistory();
  }

  getHistory(chatId: number): ChatMessage[] {
    return this.history[chatId]?.messages || [];
  }

  async summarizeSession(chatId: number): Promise<string | null> {
    const state = this.history[chatId];
    if (!state || state.messages.length <= 1) return null;

    // Get only new messages since last summary (excluding system prompt)
    const newMessages = state.messages.slice(
      Math.max(1, state.lastSummarizedIndex + 1) // Skip system prompt and already summarized messages
    );

    if (newMessages.length === 0) return null;

    try {
      // Create a prompt for summarization
      const summaryPrompt = `Суммаризируй следующий диалог между психологом и пациентом. 
      Сохрани ключевые моменты, эмоциональное состояние пациента, основные проблемы и прогресс.
      Ответь на русском языке в формате краткого отчета.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: summaryPrompt },
          ...newMessages
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const summary = completion.choices[0].message?.content;
      if (summary) {
        // Keep only system prompt and summaries
        const systemPrompt = state.messages[0]; // Keep the system prompt
        const summaries = state.messages.filter(msg => 
          msg.role === 'assistant' && msg.content.startsWith('[Суммаризация сессии]:')
        );
        
        // Create new history with only system prompt and summaries
        state.messages = [systemPrompt, ...summaries];
        
        // Add new summary
        await this.addMessage(chatId, { 
          role: "assistant", 
          content: `[Суммаризация сессии]: ${summary}` 
        });
        
        // Update last summarized index to the end of the new history
        state.lastSummarizedIndex = state.messages.length - 1;
        await this.saveHistory();
        
        return summary;
      }
      return null;
    } catch (error) {
      console.error('Error summarizing session:', error);
      return null;
    }
  }

  async clearHistory(chatId: number): Promise<void> {
    delete this.history[chatId];
    await this.saveHistory();
  }

  // Cleanup method to be called when shutting down
  async cleanup(): Promise<void> {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    await this.saveHistory();
  }
} 