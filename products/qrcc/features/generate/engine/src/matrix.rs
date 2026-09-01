//! シンボルのモジュール配置。
//!
//! 1D も 2D も同じ格子で表す。1D は高さ 1 行で、描画時に `bar_height` まで
//! 引き伸ばす。こうしておくと描画側が symbology を知らずに済む。

extern crate alloc;
use alloc::vec;
use alloc::vec::Vec;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Modules {
    width: usize,
    height: usize,
    /// 行優先。`true` が暗モジュール。
    dark: Vec<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("module grid must not be empty and must match width x height")]
pub struct InvalidModules;

impl Modules {
    pub fn new(width: usize, height: usize, dark: Vec<bool>) -> Result<Self, InvalidModules> {
        if width == 0 || height == 0 || dark.len() != width * height {
            return Err(InvalidModules);
        }
        Ok(Self {
            width,
            height,
            dark,
        })
    }

    /// 1 行だけのシンボル（1D バーコード）。
    pub fn from_row(row: Vec<bool>) -> Result<Self, InvalidModules> {
        let width = row.len();
        Self::new(width, 1, row)
    }

    pub fn width(&self) -> usize {
        self.width
    }

    pub fn height(&self) -> usize {
        self.height
    }

    pub fn is_dark(&self, x: usize, y: usize) -> bool {
        if x >= self.width || y >= self.height {
            return false;
        }
        self.dark.get(y * self.width + x).copied().unwrap_or(false)
    }

    /// 各行を `0`/`1` の文字列にする。ゴールデンテストの比較に使う。
    pub fn to_bit_rows(&self) -> Vec<alloc::string::String> {
        (0..self.height)
            .map(|y| {
                (0..self.width)
                    .map(|x| if self.is_dark(x, y) { '1' } else { '0' })
                    .collect()
            })
            .collect()
    }

    /// 静寂域を付けた新しい格子を返す。
    pub fn with_quiet_zone(&self, modules: usize) -> Self {
        if modules == 0 {
            return self.clone();
        }
        let width = self.width + modules * 2;
        let height = self.height + modules * 2;
        let mut dark = vec![false; width * height];
        for y in 0..self.height {
            for x in 0..self.width {
                if self.is_dark(x, y)
                    && let Some(cell) = dark.get_mut((y + modules) * width + (x + modules))
                {
                    *cell = true;
                }
            }
        }
        Self {
            width,
            height,
            dark,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_a_grid_that_does_not_match_its_size() {
        assert_eq!(Modules::new(2, 2, vec![true; 3]), Err(InvalidModules));
        assert_eq!(Modules::new(0, 1, vec![]), Err(InvalidModules));
    }

    #[test]
    fn reads_cells_in_row_major_order() {
        let modules = Modules::new(2, 2, vec![true, false, false, true]).expect("valid");
        assert!(modules.is_dark(0, 0));
        assert!(!modules.is_dark(1, 0));
        assert!(!modules.is_dark(0, 1));
        assert!(modules.is_dark(1, 1));
    }

    #[test]
    fn treats_out_of_range_cells_as_light() {
        let modules = Modules::new(1, 1, vec![true]).expect("valid");
        assert!(!modules.is_dark(9, 0));
        assert!(!modules.is_dark(0, 9));
    }

    #[test]
    fn renders_bit_rows_for_golden_comparison() {
        let modules =
            Modules::new(3, 2, vec![true, false, true, false, true, false]).expect("valid");
        assert_eq!(
            modules.to_bit_rows(),
            vec!["101".to_string(), "010".to_string()]
        );
    }

    #[test]
    fn adds_a_quiet_zone_on_every_side() {
        let modules = Modules::from_row(vec![true])
            .expect("valid")
            .with_quiet_zone(2);
        assert_eq!(modules.width(), 5);
        assert_eq!(modules.height(), 5);
        assert!(modules.is_dark(2, 2));
        assert!(!modules.is_dark(0, 0));
    }

    #[test]
    fn a_zero_quiet_zone_changes_nothing() {
        let modules = Modules::from_row(vec![true, false]).expect("valid");
        assert_eq!(modules.with_quiet_zone(0), modules);
    }
}
