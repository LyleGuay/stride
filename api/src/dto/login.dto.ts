import { Property, PropertyType } from "../lib/dto";

export class LoginDTO {
  @Property(PropertyType.String)
  username: string;

  @Property(PropertyType.String)
  password: string;
}
