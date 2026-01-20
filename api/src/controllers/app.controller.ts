import {
  Body,
  Controller,
  HttpReq,
  HttpRes,
  Param,
  Query,
  Route,
} from "../app";
import { CalorieLogItem } from "../entities";
import { Inject } from "../lib/di";
import { DB } from "../lib/db";

@Controller("app")
export class AppController {
  constructor(@Inject() private db: DB) {}

  @Route("GET", "/")
  async getHealth(): Promise<{ health: string }> {
    return { health: "up" };
  }

  @Route("GET", "/test/param/:id")
  async testParam(@Param("id") id: string) {
    return {
      id: id,
    };
  }

  @Route("GET", "/test/query")
  async testQuery(@Query("loc") loc: string) {
    return {
      loc,
    };
  }

  @Route("POST", "/calories")
  async createItem(@Body() body: any) {
    console.log(`BODY: ${JSON.stringify(body)}`);

    let item = this.db.create(CalorieLogItem);

    Object.assign(item, body);

    item.userId = 1;
    item.createdAt = new Date();

    await this.db.save(item);

    return item;
  }

  @Route("GET", "/calories")
  async getItems() {
    return await this.db.fetch(CalorieLogItem, {
      userId: 1,
    });
  }

  @Route("PUT", "/calories/:id")
  async updateItem(@Param("id") id: number, @Body() updateParams: any) {
    const item = await this.db.fetchOne(CalorieLogItem, { id: id });

    if (!item) {
      throw new Error(`Calorie item ${id} not found`);
    }

    Object.assign(item, updateParams);

    await this.db.save(item);

    return item;
  }

  // @Route("POST", "/eval")
  // async evalScript(req: Req): Promise<any> {
  //   const script = req.body.script;
  //   const parser = new Parser(script);

  //   const ast = parser.parse();

  //   const codeGen = new CodeGeneratorJS(ast);
  //   codeGen.emit();

  //   const context = codeGen.run();

  //   return context;
  // }
}
