export interface StrokeData {
  id?: number;
  points: [number, number, number][]; // [x, y, pressure]
  color: string;
  width: number;
}
