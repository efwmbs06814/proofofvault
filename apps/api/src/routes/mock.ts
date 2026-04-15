import type { FastifyInstance } from "fastify";

type MockRouteServices = {
  mockDataService: {
    getDemoState: typeof import("../services/mock-data-service.js").MockDataService.prototype.getDemoState;
  };
};

export async function registerMockRoutes(app: FastifyInstance, services: MockRouteServices): Promise<void> {
  app.get("/demo/mock", async () => services.mockDataService.getDemoState());
}
