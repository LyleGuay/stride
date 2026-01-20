import { Column, ColumnType, Table } from "../lib/db";

@Table('habits')
export class Habit {
  @Column("user_id", ColumnType.Number) 
  userId: number;
}