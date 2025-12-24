-- Seed catalog with common erosion control and site work items
INSERT INTO catalog_items (item_type, description, default_unit, default_unit_cost, default_unit_price, category) VALUES
  -- Erosion Control
  ('silt_fence', 'Silt Fence Installation', 'LF', 2.50, 4.00, 'Erosion Control'),
  ('inlet_protection', 'Storm Drain Inlet Protection', 'EA', 45.00, 75.00, 'Erosion Control'),
  ('construction_entrance', 'Construction Entrance', 'EA', 800.00, 1200.00, 'Erosion Control'),
  ('erosion_blanket', 'Erosion Control Blanket', 'SY', 1.50, 2.50, 'Erosion Control'),
  ('wattle', 'Fiber Wattle / Straw Wattle', 'LF', 3.00, 5.00, 'Erosion Control'),
  ('sediment_basin', 'Temporary Sediment Basin', 'EA', 2000.00, 3500.00, 'Erosion Control'),
  
  -- Site Work
  ('grading', 'Rough Grading', 'SF', 0.15, 0.25, 'Site Work'),
  ('fine_grading', 'Fine Grading', 'SF', 0.20, 0.35, 'Site Work'),
  ('excavation', 'Excavation', 'CY', 8.00, 15.00, 'Site Work'),
  ('fill', 'Import Fill Material', 'CY', 12.00, 22.00, 'Site Work'),
  ('compaction', 'Soil Compaction', 'SF', 0.10, 0.18, 'Site Work'),
  
  -- Drainage
  ('storm_pipe', 'Storm Drain Pipe', 'LF', 25.00, 45.00, 'Drainage'),
  ('catch_basin', 'Catch Basin', 'EA', 1500.00, 2500.00, 'Drainage'),
  ('manhole', 'Storm Drain Manhole', 'EA', 3000.00, 5000.00, 'Drainage'),
  ('rip_rap', 'Rip Rap', 'TON', 45.00, 75.00, 'Drainage'),
  
  -- Concrete
  ('concrete_sidewalk', 'Concrete Sidewalk', 'SF', 6.00, 10.00, 'Concrete'),
  ('concrete_curb', 'Concrete Curb & Gutter', 'LF', 18.00, 30.00, 'Concrete'),
  ('concrete_flatwork', 'Concrete Flatwork', 'SF', 7.00, 12.00, 'Concrete'),
  
  -- Asphalt
  ('asphalt_paving', 'Asphalt Paving (2")', 'SF', 2.50, 4.50, 'Asphalt'),
  ('asphalt_overlay', 'Asphalt Overlay', 'SF', 1.50, 2.75, 'Asphalt'),
  ('asphalt_milling', 'Asphalt Milling', 'SF', 0.75, 1.25, 'Asphalt'),
  
  -- Miscellaneous
  ('mobilization', 'Mobilization', 'LS', 500.00, 1000.00, 'General'),
  ('traffic_control', 'Traffic Control', 'DAY', 250.00, 450.00, 'General'),
  ('surveying', 'Survey / Layout', 'LS', 400.00, 750.00, 'General')
ON CONFLICT DO NOTHING;
