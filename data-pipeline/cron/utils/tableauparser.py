from .buildingnames import alias_map

class TableauDataParser:
    def __init__(self, json_data):
        self.data = json_data
        self.data_segments = self._get_data_segments()
        self.columns = self._get_columns()

    def _get_data_segments(self):
        """Extract the data segments containing actual values"""
        try:
            return self.data["secondaryInfo"]["presModelMap"]["dataDictionary"]["presModelHolder"]["genDataDictionaryPresModel"]["dataSegments"]
        except KeyError:
            return {}

    def _get_columns(self):
        """Extract column definitions"""
        try:
            viz_data = self.data["secondaryInfo"]["presModelMap"]["vizData"]["presModelHolder"]["genPresModelMapPresModel"]["presModelMap"]["EventSummary"]["presModelHolder"]["genVizDataPresModel"]
            return viz_data["paneColumnsData"]["vizDataColumns"]
        except KeyError:
            return []

    def get_column_names(self):
        """Get list of column names"""
        return [col.get("fieldCaption") for col in self.columns if col.get("fieldCaption")]

    def get_column_data(self, column_name):
        """Get data for a specific column"""
        # Find the column definition
        col_def = next((col for col in self.columns if col.get("fieldCaption") == column_name), None)
        if not col_def:
            return []

        # Get indices from pane columns
        pane_idx = col_def["paneIndices"][0]
        col_idx = col_def["columnIndices"][0]

        try:
            viz_data = self.data["secondaryInfo"]["presModelMap"]["vizData"]["presModelHolder"]["genPresModelMapPresModel"]["presModelMap"]["EventSummary"]["presModelHolder"]["genVizDataPresModel"]
            pane_columns = viz_data["paneColumnsData"]["paneColumnsList"][pane_idx]["vizPaneColumns"][col_idx]

            # Get value indices
            value_indices = pane_columns["valueIndices"]

            # Map indices to actual values from data segments
            data_type = col_def.get("dataType")
            if data_type:
                segment_values = []
                for segment in self.data_segments.values():
                    for col in segment["dataColumns"]:
                        if col["dataType"] == data_type:
                            segment_values.extend(col["dataValues"])

                return [segment_values[i] for i in value_indices]

        except (KeyError, IndexError):
            return []

    def to_dict(self, columns_to_skip=None):
        """Convert data to nested dictionary format organized by buildings and rooms"""
        if columns_to_skip is None:
            columns_to_skip = ["Measure Names", "Measure Values", "Open/Close",
                            "Customer/Contact", "StartDate", "CustomerContact"]

        # Get all column data
        all_data = {}
        for col_name in self.get_column_names():
            if col_name not in columns_to_skip:
                all_data[col_name] = self.get_column_data(col_name)

        result = {"buildings": {}}

        for i in range(len(all_data.get("Building", []))):
            building = all_data["Building"][i]

            # Skip if building not in alias mapping
            if building not in alias_map:
                continue

            # Use the alias mapping instead of the original building name
            building_alias = alias_map[building]

            room = all_data["Room"][i]
            event_name = all_data["EventName"][i]
            start_time = all_data["StartTime"][i][:-3] # removes seconds
            occupant = all_data["Customer"][i]
            full_end_time = all_data["ATTR(EndTime)"][i]
            end_time = full_end_time.split()[1][:-3]

            if building_alias not in result["buildings"]:
                result["buildings"][building_alias] = {"rooms": {}}

            if room not in result["buildings"][building_alias]["rooms"]:
                result["buildings"][building_alias]["rooms"][room] = []

            event_info = {
                "event_name": event_name,
                "occupant": occupant,
                "time": {
                    "start": start_time,
                    "end": end_time
                }
            }

            result["buildings"][building_alias]["rooms"][room].append(event_info)

        return result
