export interface WorkerHealth {
  service: "worker";
  status: "ok";
}

export const health = (): WorkerHealth => ({
  service: "worker",
  status: "ok",
});
