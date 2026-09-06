import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCartTotal } from '../src/cartTotal.mjs';

test('lee el total estimado del carro de Lider', () => {
  // Texto real del carro de Lider, con la trampa incluida: $20.825 es lo que
  // falta para despacho gratis, no el total, y es el numero mas grande.
  const text = `Carro (6 productos)
    Retiro Pickup o Despacho a Domicilio, BUENAVENTURA 1770, VITACURA
    Retiro sin costo o agrega $20.825 para obtener despacho gratis
    Avena Tradicional $2.190
    Leche Natural Descremada Loncoleche $1.190
    Productos (6) $9.175
    Total estimado $9.175`;

  assert.equal(parseCartTotal(text), 9_175);
});

test('lee el subtotal del carro de aCuenta', () => {
  const text = `Carrito de compras
    Avena Tradicional 700 g Lider $2.090
    Leche Semidescremada 1 L Lider $1.000
    Te faltan $16.895 para completar el pedido minimo
    Subtotal: $8.105`;

  // El monto del pedido minimo es mayor y aparece antes; no debe ganar.
  assert.equal(parseCartTotal(text), 8_105);
});

test('lee el monto que Lider pone en el boton del carro', () => {
  assert.equal(parseCartTotal('El carro tiene 1 producto Monto total $2.190'), 2_190);
});

test('prefiere el total sobre el subtotal cuando conviven', () => {
  assert.equal(parseCartTotal('Subtotal $8.000 Total estimado $7.400'), 7_400);
});

test('devuelve cero cuando la pagina no muestra un total', () => {
  assert.equal(parseCartTotal('Tu carro esta vacio'), 0);
  assert.equal(parseCartTotal(''), 0);
  assert.equal(parseCartTotal(null), 0);
});

test('no confunde un monto lejano al rotulo', () => {
  // Mas de 24 caracteres entre "total" y el monto: ya es otra frase.
  assert.equal(
    parseCartTotal('total de productos revisados en las cinco cadenas fue $9.175'),
    0,
  );
});

test('tolera acentos y mayusculas', () => {
  assert.equal(parseCartTotal('MONTO TOTAL $12.500'), 12_500);
});
