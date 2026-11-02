-- 直接新增带默认值的列（默认关闭 GeoGebra 动态演示），保留所有账户和关联数据，避免重建用户表。
ALTER TABLE "User" ADD COLUMN "enableGeogebra" BOOLEAN NOT NULL DEFAULT false;
