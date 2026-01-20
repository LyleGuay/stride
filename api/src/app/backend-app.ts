import express, { Request, Response, Express } from "express";
import path from "path";
import {
  getAllRoutes,
  getControllerMetadata,
  getParamMetadata,
  ParamMetadata,
} from "./decorators";
import { diContainer } from "../lib/di";
import { validateDTO, ValidationError } from "../lib/dto";
import { UserError } from "../lib/common";
import { AuthService, UserInfo } from "../lib/auth";

export interface BackendAppOptions {
  apiPrefix?: string;
  staticDir?: string;
}

export class BackendApp {
  private app: Express;
  private apiPrefix: string;
  private staticDir?: string;

  constructor(options: BackendAppOptions = {}) {
    this.app = express();
    this.apiPrefix = options.apiPrefix || "/api";
    this.staticDir = options.staticDir;

    // Middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  start() {
    const PORT = process.env.PORT || 3001;

    // Serve static files from client build (after API routes are registered)
    if (this.staticDir) {
      this.app.use(express.static(this.staticDir));

      // SPA fallback - serve index.html for any non-API routes
      this.app.get("/{*splat}", (req: Request, res: Response) => {
        if (!req.path.startsWith(this.apiPrefix)) {
          res.sendFile(path.join(this.staticDir!, "index.html"));
        }
      });
    }

    // Start server
    this.app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  }

  registerController(controller: any) {
    const instance = diContainer.resolve(controller);
    const basePath = getControllerMetadata(controller);

    if (basePath) {
      // You can now use the basePath to register routes
      console.log(`Registering controller at: ${this.apiPrefix}/${basePath}`);

      const routes = getAllRoutes(controller);

      for (const [methodName, routeMetadata] of routes) {
        const { method, path: routePath, public: isPublic } = routeMetadata;
        const httpMethod = method.toLowerCase() as
          | "get"
          | "post"
          | "put"
          | "delete"
          | "patch"
          | "options"
          | "head";

        // Prefix all routes with the API prefix
        const fullPath = `${this.apiPrefix}/${basePath}${routePath}`;
        console.log(`Register - ${method} ${fullPath} -> ${methodName}()`);

        // Dynamically register the route with Express
        this.app[httpMethod](fullPath, async (req: Request, res: Response) => {
          try {
            let user: UserInfo | null = null;

            if (!isPublic) {
              const authTokenStr = req.headers["authorization"];
              if (!authTokenStr) {
                throw new UserError(`Expected an authtoken!`);
              }

              if (!authTokenStr.startsWith("Bearer ")) {
                throw new Error("Expected a Bearer token!");
              }

              const authToken = authTokenStr.replace("Bearer ", "");

              const authService = diContainer.resolve<AuthService>(AuthService);
              const tokenPayload = authService.validateToken(authToken);

              user = tokenPayload;
            }

            const paramMetadata: ParamMetadata[] =
              getParamMetadata(instance, methodName) || [];

            // Build args array based on parameter positions
            const args: any[] = [];
            for (const param of paramMetadata) {
              switch (param.type) {
                case "req":
                  args[param.index] = req;
                  break;
                case "res":
                  args[param.index] = res;
                  break;
                case "body":
                  const paramTypes = Reflect.getMetadata(
                    "design:paramtypes",
                    instance as any,
                    methodName
                  );
                  const dtoClass = paramTypes?.[param.index];
                  if (dtoClass) {
                    // Validate req.body against dtoClass using getProperties()
                    const validated = validateDTO<any>(req.body, dtoClass);
                    args[param.index] = validated;
                  } else {
                    args[param.index] = param.data
                      ? req.body[param.data]
                      : req.body;
                  }
                  break;
                case "query":
                  args[param.index] = param.data
                    ? req.query[param.data]
                    : req.query;
                  break;
                case "params":
                  args[param.index] = param.data
                    ? req.params[param.data]
                    : req.params;
                  break;
                case "user":
                  if (isPublic) {
                    throw new Error(
                      `Route ${method} ${routePath} has @User but is public!`
                    );
                  }
                  args[param.index] = user;
                  break;
              }
            }

            // Call route handler
            const result = await (instance as any)[methodName](...args);
            if (!res.headersSent) {
              res.json(result);
            }
          } catch (error) {
            if (res.headersSent) return;

            console.error(`Error in ${methodName}:`, error);

            // Only show "user errors" since they are something user can take action to fix.
            if (error instanceof UserError) {
              res.status(400).json({ error: error.message });
            } else {
              res.status(500).json({ error: "Internal server error" });
            }
          }
        });
      }
    }
  }
}

export type HttpReq = Request;
export type HttpRes = Response;
