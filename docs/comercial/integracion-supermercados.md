# Integración de carro con supermercados

Estado de la carga automática del carro por cadena, y qué hay que pedirle a las
dos que faltan. Escrito para poder mandarlo tal cual a un contacto comercial.

Verificado contra los sitios en producción el 2026-07-29.

---

## Dónde estamos

| Cadena | Cómo funciona hoy | Estado |
|---|---|---|
| **Jumbo** | Carro compartido (Checkout API de VTEX) | ✅ Verificado: 3/4 productos, la tienda confirmó el 4º sin stock |
| **Santa Isabel** | Carro compartido (Checkout API de VTEX) | ✅ Verificado: 4/4 productos, $10.150 |
| **Unimarc** | Carro compartido (Checkout API de VTEX) | ✅ Verificado: 4/4 productos, $25.655 |
| **Lider** | Enlace directo `/checkout/cart/add` | ⚠️ Pendiente de confirmar por el usuario (ver nota) |
| **aCuenta** | Sin carga automática | ❌ Requiere gestión con Instaleap |
| **Tottus** | Sin carga automática | ❌ Requiere gestión con Falabella/Tottus |

### Cómo funciona el carro compartido (las 3 que sí andan)

1. Convive crea un carro anónimo en la Checkout API de la cadena
   (`POST /api/checkout/pub/orderForm`, en el host de su cuenta VTEX).
2. Le agrega todos los SKU de una vez (`POST .../orderForm/{id}/items`).
3. La tienda **responde qué quedó adentro**, con nombre, cantidad y precio.
4. La persona abre `https://{tienda}.cl/checkout/?orderFormId={id}` y ahí
   inicia sesión, elige despacho y paga.

Los pasos 1 y 2 son servidor a servidor, así que no hay restricción de CORS.
Convive nunca ve datos de pago ni crea pedidos: solo prepara el carro.

### Nota sobre Lider

Lider no expone la Checkout API a llamadas desde servidor (su WAF las
bloquea), pero eso no invalida el mecanismo: **una navegación del navegador de
la persona no está sujeta al mismo bloqueo que una llamada nuestra**. Convive
arma la URL y no intenta abrirla ni validarla antes.

La contrapartida honesta: tampoco podemos leer el carro de Lider después, así
que la interfaz le pide a la persona que lo revise en vez de afirmar que quedó
cargado.

---

## Lo que necesitamos de Tottus

Tottus corre sobre una arquitectura headless con CommerceTools. CommerceTools
soporta de forma nativa lo que necesitamos: carro anónimo con `anonymousId`,
persistente, y fusión con el carro del cliente al iniciar sesión
(`MergeWithExistingCustomerCart`).

Lo que no podemos hacer por nuestra cuenta es crear ese carro: requiere acceso
autorizado al proyecto CommerceTools de Tottus, o un endpoint intermediario de
Tottus. Crear el carro en otro proyecto no sirve, y copiar tokens del frontend
tampoco es una opción.

**La petición concreta:**

> Necesitamos un endpoint que reciba una lista de SKU, cantidades y tienda, cree
> un carro anónimo en Tottus y devuelva una URL temporal para adoptarlo en
> tottus.cl. La persona se autentica, elige despacho y paga exclusivamente
> dentro de Tottus.

Es una integración chica: no involucra datos bancarios, no crea pedidos, y todo
el checkout sigue ocurriendo en su plataforma. Nosotros solo llevamos al cliente
con el carro ya armado.

---

## Lo que necesitamos de aCuenta

aCuenta **no corre sobre la plataforma de Lider**, aunque ambas sean Walmart. Su
aplicación oficial usa el identificador `io.instaleap.ecommerce.acuenta`, o sea
que su experiencia digital es de Instaleap.

Instaleap tiene motor de e-commerce, catálogo y conectores de marketplace, con
APIs protegidas por una clave que ellos entregan. No publican un endpoint
genérico para transferir el carro de un tercero, así que hay que pedirlo.

Dos mecanismos a explorar, en este orden:

1. **Lista compartible.** Convive crea o importa una lista de compra y abre la
   app o el sitio; la persona pulsa "Agregar todo al carro". La app ya ofrece
   listas personalizables, así que la pieza base existe.
2. **Traspaso de carro.** Creación de una sesión anónima que devuelva un
   universal link hacia aCuenta con el carro ya armado.

**Lo que NO hay que pedir:** la API pública de "Create Job" de Instaleap
corresponde a una etapa posterior de operación y entrega, no a esto. Lo que
necesitamos es acceso al módulo de e-commerce o una integración de marketplace
de pre-checkout.

---

## Qué ofrecemos a cambio

Vale la pena decirlo en la conversación comercial: Convive le lleva a la cadena
un carro armado y una compra decidida. La persona ya eligió esa tienda porque
nuestro comparador la mostró como la más conveniente para su lista completa. No
dividimos la compra entre supermercados.
