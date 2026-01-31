import { Column, ColumnType, ForeignKey, Table } from "../lib/db";

enum HabitCadence {
  daily = 'daily',
  weekly = 'weekly'
}

@Table('habits')
export class Habit {
  @Column("id", ColumnType.Number, { primary: true })
  id: number;

  @Column("name", ColumnType.String, { maxLength: 255 })
  name: string;

  @Column('cadence', ColumnType.Enum, { enum: HabitCadence })
  cadence: HabitCadence;

  // @Column("user_id", ColumnType.Number)
  // @ForeignKey("users", "id", { onDelete: "CASCADE" })
  // userId: number;
}