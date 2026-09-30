-- La identidad de la cartola es el archivo y la fila. El índice anterior
-- trataba como duplicado un movimiento real cuando otra cartola repetía
-- la misma fecha, el mismo monto y el mismo número de operación.
DROP INDEX IF EXISTS public.idx_bank_transactions_dedup;
