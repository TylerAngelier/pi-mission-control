export interface ControlApiHealth {
  service: "control-api";
  status: "ok";
}

export const health = (): ControlApiHealth => ({
  service: "control-api",
  status: "ok",
});
