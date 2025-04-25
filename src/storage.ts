import fs from 'fs';
import path from 'path';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export class Storage {
  private dataDir: string;

  constructor() {
    // Use the same path in both Docker and local environments
    this.dataDir = path.join(process.cwd(), 'data');
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  async saveConversations(conversations: { [key: number]: ChatMessage[] }): Promise<void> {
    const filePath = path.join(this.dataDir, 'conversations.json');
    await fs.promises.writeFile(filePath, JSON.stringify(conversations, null, 2));
  }

  async loadConversations(): Promise<{ [key: number]: ChatMessage[] }> {
    const filePath = path.join(this.dataDir, 'conversations.json');
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }
} 