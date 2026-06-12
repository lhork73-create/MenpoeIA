import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import transcribeRouter from "./transcribe";
import ttsRouter from "./tts";
import conversationsRouter from "./conversations";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(transcribeRouter);
router.use(ttsRouter);
router.use(conversationsRouter);
router.use(settingsRouter);

export default router;
