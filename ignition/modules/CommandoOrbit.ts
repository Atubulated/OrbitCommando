import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CommandoOrbitModule = buildModule("CommandoOrbitModule", (m) => {
  const commandoOrbit = m.contract("CommandoOrbit");
  return { commandoOrbit };
});

export default CommandoOrbitModule;