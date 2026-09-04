-- dtelco_order_item is not offered to the reporting role.
--
-- It was granted for symmetry with dtelco_order. The symmetry does not hold: dtelco_reader_surface
-- reports the table as neither contact keyed nor supporting any granted contact-keyed view.
-- v_dtelco_orders reads dtelco_order and nothing else, and this table is keyed by order_id, so it
-- cannot relate to master_contact and cannot be connected as a remote source.
--
-- Offering it would put a table in the remote source picker that a person could select and then
-- not be able to use. The order itself is offered through v_dtelco_orders, which is contact keyed.
--
-- The alternative is to add contact_key to this table so the grant becomes legitimate, which would
-- enable a real segment such as an accessory bought alongside a handset. No journey in the matrix
-- asks for it today, and adding the column is a small change if one ever does.

revoke select on public.dtelco_order_item from dengage_reader;

-- The read policy stays. A policy with no grant grants nothing, and dropping it would be the
-- deletion this repository does not do. If the table is ever made contact keyed and offered
-- again, the grant is all that has to come back.
comment on table public.dtelco_order_item is
  'Order line items, keyed by order_id. Deliberately NOT granted to dengage_reader: it carries no contact key, so it can never be a remote source, and offering it would put an unconnectable table in the picker. The order itself is offered through v_dtelco_orders.';
