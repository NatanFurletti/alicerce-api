-- CreateEnum
CREATE TYPE "rate_convention" AS ENUM ('EFFECTIVE', 'NOMINAL');

-- CreateEnum
CREATE TYPE "amortization_system" AS ENUM ('SAC', 'PRICE');

-- CreateEnum
CREATE TYPE "extra_payment_strategy" AS ENUM ('REDUCE_TERM', 'REDUCE_INSTALLMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "property_value" BIGINT NOT NULL,
    "down_payment" BIGINT NOT NULL,
    "monthly_income" BIGINT,
    "term_months" INTEGER NOT NULL,
    "annual_rate" DOUBLE PRECISION NOT NULL,
    "rate_convention" "rate_convention" NOT NULL,
    "amortization_system" "amortization_system" NOT NULL,
    "mip_monthly_rate" DOUBLE PRECISION NOT NULL,
    "dfi_monthly_rate" DOUBLE PRECISION NOT NULL,
    "admin_fee_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_payments" (
    "id" UUID NOT NULL,
    "simulation_id" UUID NOT NULL,
    "month_number" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "strategy" "extra_payment_strategy" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extra_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "simulations_user_id_created_at_idx" ON "simulations"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "extra_payments_simulation_id_month_number_idx" ON "extra_payments"("simulation_id", "month_number");

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_payments" ADD CONSTRAINT "extra_payments_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
