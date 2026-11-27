-- Guarda un resumen de la última boleta confirmada por el titular.
ALTER TABLE public.resident_utility_accounts
    ADD COLUMN bill_due_date DATE,
    ADD COLUMN bill_amount INTEGER CHECK (bill_amount >= 0),
    ADD COLUMN last_paid_bill_due_date DATE;
