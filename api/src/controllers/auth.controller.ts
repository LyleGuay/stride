import {
  Body,
  Controller,
  HttpReq,
  HttpRes,
  Param,
  Query,
  Route,
  User,
} from "../app";
import { LoginDTO } from "../dto/login.dto";
import { CalorieLogItem } from "../entities";
import { AuthService, UserInfo } from "../lib/auth";
import { Inject } from "../lib/di";
import { DB } from "../lib/db";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject() private db: DB,
    @Inject() private authService: AuthService
  ) {}

  @Route("POST", "/login", { public: true })
  async login(@Body() loginParams: LoginDTO) {
    console.log(`loginParams: ${JSON.stringify(loginParams)}`);
    // return loginParams;
    const jwt = await this.authService.login(
      loginParams.username,
      loginParams.password
    );

    return {
      authToken: jwt,
    };
  }

  @Route("GET", "/check")
  async checkLogin(@User() user: UserInfo) {
    return user;
  }
}
