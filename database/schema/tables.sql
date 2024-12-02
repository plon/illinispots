CREATE TABLE buildings (
    name TEXT PRIMARY KEY,
    latitude DECIMAL(10,8),
    longitude DECIMAL(10,8),
    monday_open TIME,
    monday_close TIME,
    tuesday_open TIME,
    tuesday_close TIME,
    wednesday_open TIME,
    wednesday_close TIME,
    thursday_open TIME,
    thursday_close TIME,
    friday_open TIME,
    friday_close TIME,
    saturday_open TIME,
    saturday_close TIME,
    sunday_open TIME,
    sunday_close TIME
);

CREATE TABLE rooms (
    building_name TEXT REFERENCES buildings(name),
    room_number TEXT,
    PRIMARY KEY (building_name, room_number)
);

CREATE TABLE class_schedule (
    building_name TEXT,
    room_number TEXT,
    course_code TEXT NOT NULL,
    course_title TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    day_of_week CHAR(1) NOT NULL,
    FOREIGN KEY (building_name, room_number) REFERENCES rooms(building_name, room_number)
);

CREATE TABLE daily_events (
    id SERIAL PRIMARY KEY,
    building_name TEXT NOT NULL,
    room_number TEXT NOT NULL,
    event_name TEXT NOT NULL,
    occupant TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    event_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (building_name, room_number) REFERENCES rooms(building_name, room_number)
);
