import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tabletRouter from "./tablet";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/tablet", tabletRouter);
router.use("/admin", adminRouter);

export default router;
