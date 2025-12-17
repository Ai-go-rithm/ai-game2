
export interface Message {
  role: 'user' | 'model';
  text: string;
}

export interface CharacterState {
  id: 'red' | 'black' | 'cyan' | 'purple' | 'yellow' | 'orange' | 'pink' | 'magenta' | 'darkred' | 'lightgreen' | 'lightblue' | 'brown' | 'darkblue' | 'silver';
  name: string;
  color: string;
  eyeColor: string;
  personality: string;
  position: [number, number, number];
}

export type BotId = 'red' | 'black' | 'cyan' | 'purple' | 'yellow' | 'orange' | 'pink' | 'magenta' | 'darkred' | 'lightgreen' | 'lightblue' | 'brown' | 'darkblue' | 'silver' | null;
