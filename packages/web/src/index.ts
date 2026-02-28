export interface WebHealth {
  service: "web";
  status: "ok";
}

export const health = (): WebHealth => ({
  service: "web",
  status: "ok",
});
