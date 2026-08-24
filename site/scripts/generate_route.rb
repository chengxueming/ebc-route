require "json"
require "rexml/document"

source = File.expand_path("../../EBC大环(路飞8天版).kml", __dir__)
gokyo_source = File.expand_path("../../尼泊尔EBC.kml", __dir__)
fifth_lake_source = File.expand_path("../../Gokyo 第五湖.kml", __dir__)
target = File.expand_path("../public/route-data.json", __dir__)
doc = REXML::Document.new(File.read(source))

def node_text(node, xpath)
  REXML::XPath.first(node, xpath)&.text.to_s.strip
end

def line_points(document)
  line = REXML::XPath.first(document, '//*[local-name()="LineString"]')
  node_text(line, './*[local-name()="coordinates"]').split.map do |entry|
    longitude, latitude, altitude = entry.split(',').map(&:to_f)
    [longitude.round(6), latitude.round(6), altitude.round(1)]
  end
end

def point_marker(document, pattern)
  REXML::XPath.each(document, '//*[local-name()="Placemark"]') do |placemark|
    next unless node_text(placemark, './*[local-name()="name"]').match?(pattern)
    point = REXML::XPath.first(placemark, './*[local-name()="Point"]')
    next unless point
    return node_text(point, './*[local-name()="coordinates"]').split(',').map(&:to_f)
  end
end

def nearest_index(points, target, range = 0...points.length)
  range.min_by { |index| (points[index][0] - target[0])**2 + (points[index][1] - target[1])**2 }
end

def route_metrics(points)
  radius = 6371.0088
  distance = points.each_cons(2).sum do |first, second|
    lat1 = first[1] * Math::PI / 180
    lat2 = second[1] * Math::PI / 180
    delta_lat = (second[1] - first[1]) * Math::PI / 180
    delta_lon = (second[0] - first[0]) * Math::PI / 180
    value = Math.sin(delta_lat / 2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(delta_lon / 2)**2
    2 * radius * Math.asin(Math.sqrt(value))
  end
  ascent = 0.0
  descent = 0.0
  points.each_cons(2) do |first, second|
    delta = second[2] - first[2]
    delta.positive? ? ascent += delta : descent -= delta
  end
  { points: points, distance: distance.round(2), ascent: ascent.round, descent: descent.round }
end

fragments = []
REXML::XPath.each(doc, '//*[local-name()="Placemark"]') do |placemark|
  line = REXML::XPath.first(placemark, './/*[local-name()="LineString"]')
  next unless line

  raw = node_text(line, './*[local-name()="coordinates"]')
  points = raw.split.map do |entry|
    longitude, latitude, altitude = entry.split(',').map(&:to_f)
    [longitude.round(6), latitude.round(6), altitude.round(1)]
  end
  fragments << points unless points.empty?
end

marker_pattern = /(住宿|商店|补给|帕克丁|旁波切|丁波切|朱孔|罗波切|高乐雪|大本营|卡拉帕塔|宗拉|措拉|高桥|仁乔拉|朗顿|南池|检票|吊桥|冲毁|走错|观景台|垭口|冰川|起点|终点)/
markers = []
REXML::XPath.each(doc, '//*[local-name()="Placemark"]') do |placemark|
  point = REXML::XPath.first(placemark, './*[local-name()="Point"]')
  next unless point

  name = node_text(placemark, './*[local-name()="name"]')
  next unless name.match?(marker_pattern)

  coordinates = node_text(point, './*[local-name()="coordinates"]').split(',').map(&:to_f)
  next if coordinates.length < 2

  description = node_text(placemark, './*[local-name()="description"]')
    .gsub(/<[^>]+>/, ' ')
    .gsub(/\s+/, ' ')
    .strip
  markers << {
    name: name,
    coordinates: [coordinates[0].round(6), coordinates[1].round(6), coordinates[2]&.round(1)],
    description: description
  }
end

extended = {}
REXML::XPath.each(doc, '/*[local-name()="kml"]/*[local-name()="Document"]/*[local-name()="ExtendedData"]/*[local-name()="Data"]') do |data|
  extended[data.attributes['name']] = node_text(data, './*[local-name()="value"]')
end

gokyo_doc = REXML::Document.new(File.read(gokyo_source))
gokyo_points = line_points(gokyo_doc)
gokyo_marker = point_marker(gokyo_doc, /D10-11gokyo/i)
ri_marker = point_marker(gokyo_doc, /Gokyo Ri/i)
ri_index = nearest_index(gokyo_points, ri_marker)
gokyo_start = nearest_index(gokyo_points, gokyo_marker, 0..ri_index)
gokyo_end = nearest_index(gokyo_points, gokyo_marker, ri_index...gokyo_points.length)
gokyo_ri = route_metrics(gokyo_points[gokyo_start..gokyo_end])

fifth_lake_doc = REXML::Document.new(File.read(fifth_lake_source))
fifth_lake = route_metrics(line_points(fifth_lake_doc))

payload = {
  meta: {
    title: node_text(doc, '/*[local-name()="kml"]/*[local-name()="Document"]/*[local-name()="name"]'),
    author: extended['CreaterName'],
    trackId: extended['TrackId'],
    distance: extended['Distance'].to_f,
    elevationGain: extended['ElevationGain'].to_f,
    elevationLoss: extended['ElevationLoss'].to_f,
    pointCount: fragments.sum(&:length)
  },
  fragments: fragments,
  sideTrips: { gokyoRi: gokyo_ri, fifthLake: fifth_lake },
  markers: markers.uniq { |marker| [marker[:name], marker[:coordinates][0], marker[:coordinates][1]] }
}

File.write(target, JSON.generate(payload))
puts "Wrote #{target}: #{fragments.length} fragments, #{payload[:meta][:pointCount]} points, #{payload[:markers].length} markers"
