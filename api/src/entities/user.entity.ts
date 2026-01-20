import { Column, ColumnType, Table } from "../lib/db";

@Table("users")
export class User {
  @Column("id", ColumnType.Number, { primary: true })
  id: number = 0;

  @Column("username", ColumnType.String, { maxLength: 255 })
  username: string = "";

  @Column("email", ColumnType.String, { maxLength: 255 })
  email: string = "";

  @Column("auth_token", ColumnType.String)
  authToken: string = "";

  @Column("password", ColumnType.String)
  password: string = "";
}
