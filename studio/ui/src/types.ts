// Mirror of the server's StudioEvent union (studio/server.ts).
export type StudioEvent =
  | { type: 'run-start'; runId: string; brief: string; isEdit: boolean }
  | { type: 'plan'; brand: string; mood: string[]; sections: string[]; layout: string[] }
  | { type: 'art-direction'; paletteName: string; palette: Record<string, string>; motion: string; rationale: string }
  | { type: 'section'; index: number; sectionType: string; strategy: string; backing: string; motion: string }
  | { type: 'notice'; level: 'info' | 'warn'; text: string }
  | { type: 'log'; text: string }
  | { type: 'done'; previewUrl: string; fileCount: number }
  | { type: 'error'; message: string }

export type FeedItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; iterate?: boolean }
  | { kind: 'event'; ev: StudioEvent }

export interface StudioSession {
  id: string
  brief: string
  choices: Record<string, string>
  createdAt: string
  updatedAt: string
  previewUrl?: string
}

export const API = 'http://localhost:3001'
