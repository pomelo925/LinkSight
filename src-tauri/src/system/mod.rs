//! Host system introspection: network interfaces, routing, and interface
//! statistics. Linux-first (reads from `/sys` and `/proc`).

pub mod interface;
