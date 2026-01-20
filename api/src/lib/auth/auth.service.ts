import jwt from "jsonwebtoken";
import { User } from "../../entities";
import { Inject } from "../di";
import { DB } from "../db";
import { UserError } from "../common";
import { UserInfo } from "./interface";

export class AuthService {
  constructor(@Inject() private db: DB) {}

  async login(username: string, password: string) {
    const user = await this.db.fetchOne(User, {
      username: username,
      password: password,
    });

    if (!user) {
      throw new UserError(`User not found!`);
    }
    const jwtPayload = {
      userId: user.id,
      username: user.username,
    };

    const jwtToken = jwt.sign(jwtPayload, process.env.JWT_SECRET!, {
      expiresIn: "90d",
    });

    user.authToken = jwtToken;

    await this.db.save(user);

    return jwtToken;
  }

  validateToken(token: string): UserInfo {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);

    return payload as UserInfo;
  }
}
