export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string; // base64 string
  isStreaming?: boolean;
}
