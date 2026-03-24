import type { XmtpStatus } from "../../internal-types/index.js";

import type { RuntimeContext } from "../runtime.js";

export async function handleXmtpStatus(ctx: RuntimeContext): Promise<XmtpStatus> {
  return ctx.xmtp.status();
}
