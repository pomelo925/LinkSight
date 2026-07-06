//! Network diagnostics.
//!
//! Basic Mode (no remote permission): [`ping`], [`traceroute`], [`scan`].
//! Advanced Mode (remote required): [`bandwidth`] (iperf3).
//!
//! All entry points return the shared [`model::NetworkTestResult`] so both
//! modes are interchangeable at the API boundary.

pub mod bandwidth;
pub mod connectivity;
pub mod model;
pub mod ping;
pub mod scan;
pub mod speedtest;
pub mod traceroute;
