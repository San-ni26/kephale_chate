-- CreateTable
CREATE TABLE "EventDepartmentBroadcast" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "deptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDepartmentBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventDepartmentBroadcast_eventId_deptId_key" ON "EventDepartmentBroadcast"("eventId", "deptId");

-- CreateIndex
CREATE INDEX "EventDepartmentBroadcast_deptId_idx" ON "EventDepartmentBroadcast"("deptId");

-- CreateIndex
CREATE INDEX "EventDepartmentBroadcast_eventId_idx" ON "EventDepartmentBroadcast"("eventId");

-- AddForeignKey
ALTER TABLE "EventDepartmentBroadcast" ADD CONSTRAINT "EventDepartmentBroadcast_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDepartmentBroadcast" ADD CONSTRAINT "EventDepartmentBroadcast_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
