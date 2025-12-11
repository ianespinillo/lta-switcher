// src/types.ts

export interface Country {
  id: number;
  name: string;
  flag_blob: number[]; // Array de bytes que viene de Rust
}

export interface Competition {
  id: number;
  name: string;
  logo_blob: number[];
  // El file_blob no lo traemos al front para no explotar la memoria
}